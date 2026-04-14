export const formatTime = (value?: string): string => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
};

export const formatElapsed = (start?: string, end?: string): string => {
  if (!start) {
    return "-";
  }

  const from = Date.parse(start);
  const to = end ? Date.parse(end) : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
    return "-";
  }

  const totalSeconds = Math.floor((to - from) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};
