import { computeReconnectDelay, transitionConnection, recordUiEvent } from './client-state.js';

export class UiSseClientError extends Error {
  constructor(message, code = 'ERR_UI_SSE_CLIENT', details = {}) {
    super(message);
    this.name = 'UiSseClientError';
    this.code = code;
    this.details = details;
  }
}

export function createSseClient({ apiClient, state, reconnectPolicy } = {}) {
  if (!apiClient?.createSseUrl) throw new UiSseClientError('SSE client requires an API client.', 'ERR_UI_SSE_API_CLIENT');
  if (!state) throw new UiSseClientError('SSE client requires client state.', 'ERR_UI_SSE_STATE');
  return Object.freeze({
    connect(options = {}) {
      transitionConnection(state, 'connecting', { lastEventId: options.lastEventId ?? state.connection.lastEventId });
      const url = apiClient.createSseUrl(options);
      recordUiEvent(state, { type: 'sse.connect.requested', payload: { url: redactTokenQuery(url) } });
      transitionConnection(state, 'connected', { lastEventId: options.lastEventId ?? state.connection.lastEventId });
      return Object.freeze({ url, lastEventId: options.lastEventId ?? null });
    },
    disconnect(reason = 'manual') {
      transitionConnection(state, 'disconnected', { error: reason });
      recordUiEvent(state, { type: 'sse.disconnected', payload: { reason } });
      return state.connection;
    },
    handleEvent(event) {
      if (event?.type === 'stream.reset.required') {
        transitionConnection(state, 'reconnecting', { lastEventId: null, reconnectAttempt: state.connection.reconnectAttempt + 1 });
        recordUiEvent(state, { type: 'sse.snapshot.required', payload: event.payload ?? {} });
        return 'snapshot.required';
      }
      transitionConnection(state, 'connected', { lastEventId: event.eventId ?? state.connection.lastEventId, reconnectAttempt: 0 });
      recordUiEvent(state, { type: event.type ?? 'sse.event', payload: event.payload ?? {} });
      return 'event.accepted';
    },
    nextReconnectDelay() {
      return computeReconnectDelay(state.connection.reconnectAttempt, reconnectPolicy);
    }
  });
}

function redactTokenQuery(url) {
  return String(url).replace(/(token|access_token)=([^&]+)/gi, '$1=[REDACTED]');
}
