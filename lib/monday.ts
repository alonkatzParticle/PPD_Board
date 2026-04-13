// Monday.com GraphQL client — all API calls go through here (server-side only)

const MONDAY_API_URL = process.env.MONDAY_API_URL || "https://api.monday.com/v2";
const MONDAY_API_KEY = process.env.MONDAY_API_KEY || "";

export async function mondayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_KEY,
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Monday.com API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all boards in the account to find our two target boards */
export const GET_BOARDS_QUERY = `
  query GetBoards {
    boards(limit: 50, order_by: created_at) {
      id
      name
    }
  }
`;

/** Fetch groups for a specific board */
export const GET_GROUPS_QUERY = `
  query GetGroups($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      name
      groups {
        id
        title
        color
      }
    }
  }
`;

/** Fetch columns metadata — includes settings_str needed to resolve status option indices */
export const GET_COLUMNS_QUERY = `
  query GetColumns($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      columns {
        id
        title
        type
        settings_str
      }
    }
  }
`;

/** Fetch items from a board with pagination */
export const GET_ITEMS_QUERY = `
  query GetItems($boardId: ID!, $cursor: String) {
    boards(ids: [$boardId]) {
      id
      name
      items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          group {
            id
            title
          }
          column_values {
            id
            text
            value
            type
          }
        }
      }
    }
  }
`;
