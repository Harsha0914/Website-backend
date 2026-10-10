import api from './api';

/** The signed-in account's picture library. Pictures are private to the account. */
export async function listMessageImages() {
  const res = await api.get('/whatsapp/images');
  return res.data; // { categories, limit, images: [{ id, uid, category, label, size, thumb }] }
}

export async function addMessageImage({ category, label, dataUrl, thumbUrl }) {
  const res = await api.post('/whatsapp/images', { category, label, data_url: dataUrl, thumb_url: thumbUrl });
  return res.data;
}

/** Rename, move to another category, and/or replace the picture itself (pass dataUrl + thumbUrl together). */
export async function changeMessageImage(id, { category, label, dataUrl, thumbUrl } = {}) {
  const body = {};
  if (category !== undefined) body.category = category;
  if (label !== undefined) body.label = label;
  if (dataUrl) { body.data_url = dataUrl; body.thumb_url = thumbUrl; }
  const res = await api.put(`/whatsapp/images/${id}`, body);
  return res.data;
}

export async function deleteMessageImage(id) {
  await api.delete(`/whatsapp/images/${id}`);
}

/** Friendly text for an upload / save error. */
export function imageErrorText(err) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return err?.message || 'Something went wrong. Please try again.';
}
