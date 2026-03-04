import { getJsonAuth, postJsonAuth } from '../../lib/api';

export type AdminAccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AdminAccessRequestRecord = {
  id: number;
  requester_user_id: number;
  reason: string | null;
  status: AdminAccessRequestStatus;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function getMyAdminAccessRequestStatusAuth(
  token: string,
): Promise<AdminAccessRequestRecord | null> {
  const data = await getJsonAuth<{ request: AdminAccessRequestRecord | null }>(
    '/admin-access-requests/me',
    token,
  );
  return data.request;
}

export async function submitAdminAccessRequestAuth(
  token: string,
  reason: string | null,
): Promise<AdminAccessRequestRecord> {
  const data = await postJsonAuth<{ request: AdminAccessRequestRecord }>(
    '/admin-access-requests',
    token,
    { reason },
  );
  return data.request;
}
