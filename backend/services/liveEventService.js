const EventEmitter = require('events');

class LiveEventService extends EventEmitter {
  constructor() {
    super();
    this.recentEvents = [];
    this.maxEvents = 200;
    this.clients = new Set();
  }

  emitEvent(event) {
    const enriched = {
      ...event,
      id: this.recentEvents.length + 1,
      timestamp: event.timestamp || new Date().toISOString()
    };

    this.recentEvents.push(enriched);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.shift();
    }

    const data = JSON.stringify(enriched);
    for (const client of this.clients) {
      client.write(`data: ${data}\n\n`);
    }

    this.emit('event', enriched);
    return enriched;
  }

  addClient(res) {
    this.clients.add(res);
  }

  removeClient(res) {
    this.clients.delete(res);
  }
}

module.exports = new LiveEventService();
