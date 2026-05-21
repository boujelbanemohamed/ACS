import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = "Bearer " + token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.config.url === '/auth/login' && response.data?.data?.must_change_password) {
      localStorage.setItem('must_change_password', 'true');
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("must_change_password");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  getMe: () => api.get("/auth/me"),
  changePassword: (passwords) => api.put("/auth/change-password", passwords),
};

export const banksAPI = {
  getAll: () => api.get("/banks"),
  getOne: (id) => api.get("/banks/" + id),
  create: (bankData) => api.post("/banks", bankData),
  update: (id, bankData) => api.put("/banks/" + id, bankData),
  delete: (id) => api.delete("/banks/" + id),
  getStats: (id) => api.get("/banks/" + id + "/stats"),
};

export const processingAPI = {
  processUrl: (data) => api.post("/processing/process-url", data),
  uploadFile: (formData) => api.post("/processing/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  getErrors: (fileLogId) => api.get("/processing/errors/" + fileLogId),
  resolveError: (errorId, correctedValue) => api.patch("/processing/errors/" + errorId + "/resolve", { correctedValue }),
  getLogs: (params) => api.get("/processing/logs", { params }),
  downloadCorrected: (fileLogId) => api.get("/processing/download/" + fileLogId, { responseType: "blob" }),
  reprocess: (fileLogId) => api.post("/processing/reprocess/" + fileLogId),
  validateManualEntries: (data) => api.post("/processing/validate-manual", data),
  processManualEntries: (data) => api.post("/processing/process-manual", data),
  downloadTemplate: () => api.get("/processing/template", { responseType: "blob" }),
  callExternalApi: (data) => api.post("/processing/call-api", data),
};

export const dashboardAPI = {
  getStats: () => api.get("/dashboard/stats"),
  getUnresolvedErrors: () => api.get("/dashboard/errors/unresolved"),
  getRecentRecords: (limit) => api.get("/dashboard/records/recent", { params: { limit } }),
};

export default api;
