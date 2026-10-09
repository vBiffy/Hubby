// Browser-side port implementation. Components receive this object as a prop,
// so a standalone notes screen can use any adapter with the same methods.
export const api = {
  async request(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Request failed.');
    }
    return response.status === 204 ? undefined : response.json();
  },
  list(kind) {
    return this.request(kind);
  },
  save(kind, item) {
    return this.request(`${kind}${item.id ? `/${item.id}` : ''}`, {
      method: item.id ? 'PUT' : 'POST',
      body: JSON.stringify(item),
    });
  },
  remove(kind, id) {
    return this.request(`${kind}/${id}`, { method: 'DELETE' });
  },
  restore(item) {
    return this.request(`events/${item.id}/restore`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },
};
