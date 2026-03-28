/** Standard error response returned by all tracker API error cases. */
export interface TrackerErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}

/** Standard health check response. */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}
