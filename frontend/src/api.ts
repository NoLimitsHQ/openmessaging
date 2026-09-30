import axios, { type AxiosError, type AxiosRequestConfig } from "axios";

// ------------------------------------------------------------------
// Tipler
// ------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  userTag: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  lastSeen?: string;
}

export interface Contact {
  id: string;
  email: string;
  userTag: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeen: string;
  addedAt: string;
}

export type MessageStatus = "SENT" | "DELIVERED" | "READ";

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderUserTag: string | null;
  senderUsername: string | null;
  status: MessageStatus;
  createdAt: string;
}

export interface ConversationUser {
  id: string;
  username: string | null;
  userTag: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ConversationListItem {
  id: string;
  user: ConversationUser;
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  participantA: string;
  participantB: string;
  lastMessageAt: string;
  lastMessage: string | null;
  user: ConversationUser | null;
  messages: Message[];
}

/** Tüm API fonksiyonları bu zarfı döner; `ok` false ise `error` doludur. */
export type ApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ------------------------------------------------------------------
// Token yönetimi
// ------------------------------------------------------------------
export const TOKEN_STORAGE_KEY = "openmessaging.token";

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

// ------------------------------------------------------------------
// Axios
// ------------------------------------------------------------------
/**
 * Geliştirmede "/" kullanılır ve Vite proxy devreye girer.
 * Üretimde (örn. Vercel + Render) VITE_API_URL tam backend adresine ayarlanır.
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // httpOnly cookie'leri de gönder
  headers: { "Content-Type": "application/json" },
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await api.request<T>(config);
    return res.data;
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string }>;
    const message =
      axiosErr.response?.data?.error ??
      (axiosErr.code === "ECONNABORTED"
        ? "Sunucu yanıt vermedi. Backend çalışıyor mu?"
        : axiosErr.message) ??
      "Beklenmeyen bir hata oluştu.";
    return { ok: false, error: message } as T;
  }
}

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
export function requestOtp(email: string) {
  return request<ApiResult<{ existing: boolean; message: string }>>({
    method: "POST",
    url: "/auth/register-email",
    data: { email },
  });
}

export function verifyOtp(email: string, code: string) {
  return request<ApiResult<{ step: "profile" | "logged-in"; user?: AuthUser; token?: string }>>({
    method: "POST",
    url: "/auth/verify-otp",
    data: { email, code },
  });
}

export function registerProfile(email: string, username: string, password: string) {
  return request<ApiResult<{ user: AuthUser; token: string }>>({
    method: "POST",
    url: "/auth/register-profile",
    data: { email, username, password },
  });
}

export function loginWithPassword(email: string, password: string) {
  return request<ApiResult<{ user: AuthUser; token: string }>>({
    method: "POST",
    url: "/auth/login",
    data: { email, password },
  });
}

export function fetchMe() {
  return request<ApiResult<{ user: AuthUser; token: string }>>({
    method: "GET",
    url: "/auth/me",
  });
}

export function logout() {
  return request<ApiResult>({ method: "POST", url: "/auth/logout" });
}

// ------------------------------------------------------------------
// Kişiler
// ------------------------------------------------------------------
export function fetchContacts() {
  return request<ApiResult<{ contacts: Contact[] }>>({ method: "GET", url: "/contacts" });
}

export function addContact(userTag: string) {
  return request<ApiResult<{ contact: Contact; alreadyAdded: boolean }>>({
    method: "POST",
    url: "/contacts",
    data: { userTag },
  });
}

// ------------------------------------------------------------------
// Sohbetler
// ------------------------------------------------------------------
export function fetchConversations() {
  return request<ApiResult<{ conversations: ConversationListItem[] }>>({
    method: "GET",
    url: "/conversations",
  });
}

export function startConversation(userId: string) {
  return request<ApiResult<{ conversation: ConversationListItem }>>({
    method: "POST",
    url: "/conversations",
    data: { userId },
  });
}

export function fetchConversation(id: string) {
  return request<ApiResult<{ conversation: ConversationDetail }>>({
    method: "GET",
    url: `/conversations/${id}`,
  });
}

export function markConversationRead(id: string) {
  return request<ApiResult<{ readCount: number }>>({
    method: "POST",
    url: `/conversations/${id}/read`,
    data: {},
  });
}
