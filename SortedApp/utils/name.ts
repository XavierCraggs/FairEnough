export const getFirstName = (fullName?: string, fallback = 'User'): string => {
  const safe = (fullName || '').trim();
  if (!safe) {
    return fallback;
  }
  const [first] = safe.split(/\s+/);
  return first || fallback;
};
