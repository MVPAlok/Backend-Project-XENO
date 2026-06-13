/**
 * Generates a clean URL-friendly slug from a string.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

/**
 * Generates a unique slug by appending counter suffixes if a collision is detected.
 * @param {string} name - The original name to slugify
 * @param {function} checkExists - A callback function (slug) => Promise<boolean> that returns true if the slug exists
 * @returns {Promise<string>} Unique slug
 */
export async function generateUniqueSlug(name, checkExists) {
  const baseSlug = slugify(name);
  if (!baseSlug) {
    // Fallback if the slug is empty (e.g. only special characters)
    let fallbackSlug = 'workspace';
    let slug = fallbackSlug;
    let counter = 2;
    while (await checkExists(slug)) {
      slug = `${fallbackSlug}-${counter}`;
      counter++;
    }
    return slug;
  }

  let slug = baseSlug;
  let counter = 2;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
