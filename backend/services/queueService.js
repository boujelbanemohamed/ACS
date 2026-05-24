const Queue = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let processingQueue;

class SyncJob {
  constructor(jobType, data) {
    this.id = `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.data = { jobType, ...data };
    this._progress = 0;
    this.timestamp = Date.now();
    this.processedOn = null;
    this.finishedOn = null;
    this.failedReason = null;
    this.returnvalue = null;
    this._state = 'waiting';
  }

  progress(val) {
    if (typeof val === 'number') {
      this._progress = val;
    }
    return this._progress || 0;
  }

  async getState() {
    return this._state;
  }

  async processed() {
    this._state = 'completed';
  }
}

class SyncQueue {
  constructor() {
    this.jobs = new Map();
    this._processedHandler = null;
  }

  process(handler) {
    this._processedHandler = handler;
  }

  async add(data, opts = {}) {
    const job = new SyncJob(data.jobType, data);
    job.id = opts.jobId || job.id;
    this.jobs.set(job.id, job);

    if (this._processedHandler) {
      setImmediate(async () => {
        try {
          job._state = 'active';
          job.processedOn = Date.now();
          const result = await this._processedHandler(job);
          job._state = 'completed';
          job.returnvalue = result;
          job.finishedOn = Date.now();
        } catch (err) {
          job._state = 'failed';
          job.failedReason = err.message;
          job.finishedOn = Date.now();
        }
      });
    }

    return job;
  }

  async getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async getWaitingCount() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job._state === 'waiting' || job._state === 'delayed') count++;
    }
    return count;
  }

  async getActiveCount() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job._state === 'active') count++;
    }
    return count;
  }

  async getCompletedCount() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job._state === 'completed') count++;
    }
    return count;
  }

  async getFailedCount() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job._state === 'failed') count++;
    }
    return count;
  }

  async getDelayedCount() {
    return 0;
  }

  async getActive() {
    const active = [];
    for (const job of this.jobs.values()) {
      if (job._state === 'active') active.push(job);
    }
    return active;
  }

  on() {}
}

function createQueue() {
  if (process.env.NODE_ENV === 'test') {
    return new SyncQueue();
  }

  const queue = new Queue('csv-processing', REDIS_URL, {
    defaultJobOptions: {
      attempts: parseInt(process.env.QUEUE_JOB_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY) || 5000,
      },
      removeOnComplete: parseInt(process.env.QUEUE_KEEP_COMPLETE) || 100,
      removeOnFail: parseInt(process.env.QUEUE_KEEP_FAILED) || 50,
      timeout: parseInt(process.env.QUEUE_JOB_TIMEOUT) || 120000,
    },
    limiter: {
      max: parseInt(process.env.QUEUE_MAX_PER_SECOND) || 5,
      duration: 1000,
    },
  });

  queue.on('completed', (job, result) => {
    console.log(`[Queue] Job ${job.id} (${job.data.jobType}) completed`);
  });

  queue.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job.id} (${job.data.jobType}) failed:`, err.message);
  });

  queue.on('stalled', (job) => {
    console.warn(`[Queue] Job ${job.id} stalled, will be retried`);
  });

  return queue;
}

processingQueue = createQueue();

function getJobStatus(jobState) {
  const map = {
    waiting: 'pending',
    active: 'processing',
    completed: 'completed',
    failed: 'failed',
    delayed: 'pending',
    paused: 'paused',
  };
  return map[jobState] || 'unknown';
}

async function enqueueJob(jobType, data) {
  const job = await processingQueue.add(
    { jobType, ...data },
    {
      jobId: `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }
  );
  return { jobId: job.id };
}

async function getJob(jobId) {
  const job = await processingQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const failedReason = job.failedReason;
  const returnvalue = job.returnvalue;

  return {
    jobId: job.id,
    type: job.data.jobType,
    status: getJobStatus(state),
    progress: typeof job.progress === 'function' ? job.progress() : job.progress,
    data: job.data,
    result: state === 'completed' ? returnvalue : null,
    error: state === 'failed' ? failedReason : null,
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };
}

async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    processingQueue.getWaitingCount(),
    processingQueue.getActiveCount(),
    processingQueue.getCompletedCount(),
    processingQueue.getFailedCount(),
    processingQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed, total: waiting + active + completed + failed + delayed };
}

async function getActiveJobs() {
  const jobs = await processingQueue.getActive();
  return Promise.all(jobs.map(async (j) => ({
    jobId: j.id,
    type: j.data.jobType,
    progress: j.progress,
    startedAt: j.processedOn,
  })));
}

module.exports = {
  processingQueue,
  enqueueJob,
  getJob,
  getQueueStats,
  getActiveJobs,
};
