/**
 * @file StatusBadge.jsx
 * @description Presentational badge components used throughout the portal to
 * display ticket status and priority levels in a consistent, colour-coded style.
 *
 * Exports:
 *  - StatusBadge   — renders a coloured pill for ticket lifecycle states
 *                    (PENDING, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, ESCALATED).
 *  - PriorityBadge — renders a coloured pill for ticket priority levels
 *                    (LOW, NORMAL, URGENT).
 *
 * Both components accept an unknown value gracefully by falling back to a
 * neutral grey badge that displays the raw string.
 */

/**
 * Mapping from ticket status enum values to their display label and Tailwind
 * colour classes.  Keys match the STATUS enum used by the backend.
 */
const statusConfig = {
  PENDING:     { label: 'Pending',     className: 'bg-yellow-100 text-yellow-800' },
  ASSIGNED:    { label: 'Assigned',    className: 'bg-blue-100 text-blue-800'     },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-indigo-100 text-indigo-800' },
  RESOLVED:    { label: 'Resolved',    className: 'bg-green-100 text-green-800'   },
  CLOSED:      { label: 'Closed',      className: 'bg-gray-100 text-gray-600'     },
  ESCALATED:   { label: 'Escalated',   className: 'bg-red-100 text-red-800'       },
};

/**
 * Mapping from ticket priority enum values to their display label and Tailwind
 * colour classes.  Keys match the PRIORITY enum used by the backend.
 */
const priorityConfig = {
  LOW:    { label: 'Low',    className: 'bg-gray-100 text-gray-600'              },
  NORMAL: { label: 'Normal', className: 'bg-blue-100 text-blue-700'              },
  URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-700 font-semibold'  },
};

/**
 * Renders a colour-coded badge for a ticket's lifecycle status.
 * Includes a small filled dot whose colour is derived from the badge text
 * colour via `bg-current` to maintain visual consistency without extra classes.
 *
 * @param {object} props
 * @param {string} props.status - A ticket status enum value (e.g. "IN_PROGRESS").
 *   Unknown values are rendered as a neutral grey badge showing the raw string.
 * @returns {JSX.Element}
 */
export const StatusBadge = ({ status }) => {
  // Resolve config, falling back to a neutral grey badge for unknown statuses
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`badge ${config.className}`}>
      {/* Status dot colour is inherited from the text colour via bg-current */}
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {config.label}
    </span>
  );
};

/**
 * Renders a colour-coded badge for a ticket's priority level.
 * URGENT badges additionally apply `font-semibold` for extra visual emphasis.
 *
 * @param {object} props
 * @param {string} props.priority - A ticket priority enum value (e.g. "URGENT").
 *   Unknown values are rendered as a neutral grey badge showing the raw string.
 * @returns {JSX.Element}
 */
export const PriorityBadge = ({ priority }) => {
  // Resolve config, falling back to a neutral grey badge for unknown priorities
  const config = priorityConfig[priority] || { label: priority, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
