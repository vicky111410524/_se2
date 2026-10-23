const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTodoTitle(title) {
  if (!title) return '';
  return title.trim().toUpperCase();
}

export function isValidTitle(title) {
  return typeof title === 'string' && title.trim().length >= 2;
}

export function isValidDueDate(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  return toDate(value) !== null;
}

export function formatDueDateTime(value) {
  const date = toDate(value);
  if (!date) return '未設定';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateKey(value) {
  const date = toDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateLabel(value) {
  const date = toDate(value);
  if (!date) return '未設定';
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}（${WEEKDAYS[date.getDay()]}）`;
}

export function formatTimeLabel(value) {
  const date = toDate(value);
  if (!date) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getDueStatus(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return { key: 'none', label: '未設定', tone: 'neutral' };
  if (date.getTime() < now.getTime()) return { key: 'overdue', label: '已逾期', tone: 'danger' };
  if (dateKey(date) === dateKey(now)) return { key: 'today', label: '今天到期', tone: 'today' };
  return { key: 'upcoming', label: '尚未到期', tone: 'upcoming' };
}

export function groupTodosByDate(todos = [], now = new Date()) {
  const groups = new Map();

  for (const todo of todos) {
    const date = toDate(todo.dueDate);
    const key = date ? dateKey(date) : 'none';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date,
        total: 0,
        overdue: 0,
        earliest: null
      });
    }

    const group = groups.get(key);
    group.total += 1;

    if (date) {
      if (date.getTime() < now.getTime()) group.overdue += 1;
      if (!group.earliest || date.getTime() < group.earliest.getTime()) {
        group.earliest = date;
      }
    }
  }

  return [...groups.values()]
    .map((group) => {
      let status;
      if (group.key === 'none') {
        status = { key: 'none', label: '未設定', tone: 'neutral' };
      } else if (group.overdue > 0) {
        status = { key: 'overdue', label: '有逾期', tone: 'danger' };
      } else if (group.key === dateKey(now)) {
        status = { key: 'today', label: '今天', tone: 'today' };
      } else {
        status = { key: 'upcoming', label: '即將到期', tone: 'upcoming' };
      }
      return { ...group, status };
    })
    .sort((a, b) => {
      if (a.key === 'none') return 1;
      if (b.key === 'none') return -1;
      return a.key.localeCompare(b.key);
    });
}
