export function isSelectQuery(query: string): boolean {
  // A basic normalization to avoid tampering with spacing or casing
  const normalizedQuery = query.trim().toLowerCase();
  // Only allow simple SELECT queries, prevent any subqueries, updates or modifications
  return /^select\s+[\w\s,\*]+\s+from\s+\w+(\s+where\s+.+)?$/i.test(normalizedQuery);
}
