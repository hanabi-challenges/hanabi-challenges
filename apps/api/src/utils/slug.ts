const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Common reserved paths we should not allow as slugs to avoid routing conflicts
const RESERVED_SLUGS = new Set([
  'admin',
  'admins',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'static',
  'assets',
  'events',
  'challenges',
  'teams',
  'users',
]);

export function validateSlug(slug: string | undefined | null): string | null {
  if (slug != null && typeof slug !== 'string') {
    return 'slug must be a string';
  }
  if (!slug) return 'slug is required';
  if (slug.length < 3 || slug.length > 64) {
    return 'slug must be between 3 and 64 characters';
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'slug may only contain lowercase letters, numbers, and single dashes (a-z0-9-)';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'slug is reserved';
  }
  return null;
}
