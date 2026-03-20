const statusConfig = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  ASSIGNED: { label: 'Assigned', className: 'bg-blue-100 text-blue-800' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-indigo-100 text-indigo-800' },
  RESOLVED: { label: 'Resolved', className: 'bg-green-100 text-green-800' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-600' },
  ESCALATED: { label: 'Escalated', className: 'bg-red-100 text-red-800' },
};

const priorityConfig = {
  LOW: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
  NORMAL: { label: 'Normal', className: 'bg-blue-100 text-blue-700' },
  URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-700 font-semibold' },
};

export const StatusBadge = ({ status }) => {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`badge ${config.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {config.label}
    </span>
  );
};

export const PriorityBadge = ({ priority }) => {
  const config = priorityConfig[priority] || { label: priority, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;
