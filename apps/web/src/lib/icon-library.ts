/**
 * Les pictogrammes proposés pour une table, un dossier, une valeur : des noms lucide rangés
 * par thème (la recherche couvre toute la bibliothèque), et des emoji. Un nom absent de la
 * version installée de lucide est simplement écarté à l'affichage.
 */

export const ICON_GROUPS: readonly { readonly label: string; readonly icons: readonly string[] }[] = [
  {
    label: 'Statuts',
    icons: [
      'circle', 'circle-check', 'circle-check-big', 'circle-x', 'circle-alert', 'circle-pause', 'circle-play', 'circle-stop', 'circle-dot', 'circle-dashed',
      'circle-help', 'circle-minus', 'circle-plus', 'check', 'check-check', 'x', 'ban', 'octagon-alert', 'triangle-alert', 'info', 'badge-check', 'badge-alert',
      'shield-check', 'shield-alert', 'flag', 'flag-triangle-right', 'star', 'star-half', 'heart', 'thumbs-up', 'thumbs-down', 'bookmark', 'pin', 'lock', 'lock-open',
      'eye', 'eye-off', 'hourglass', 'loader', 'clock', 'timer', 'alarm-clock', 'bell', 'bell-off', 'sparkles', 'zap', 'flame', 'snowflake',
    ],
  },
  {
    label: 'Commerce',
    icons: [
      'shopping-cart', 'shopping-bag', 'shopping-basket', 'store', 'package', 'package-check', 'package-x', 'package-open', 'boxes', 'truck', 'ship', 'warehouse',
      'credit-card', 'wallet', 'banknote', 'coins', 'piggy-bank', 'receipt', 'receipt-text', 'tag', 'tags', 'percent', 'badge-percent', 'badge-euro', 'euro',
      'dollar-sign', 'gift', 'ticket', 'barcode', 'qr-code', 'scale', 'handshake', 'undo-2', 'redo-2', 'refresh-cw', 'repeat', 'archive', 'clipboard-list',
    ],
  },
  {
    label: 'Personnes',
    icons: [
      'user', 'users', 'user-round', 'user-check', 'user-x', 'user-plus', 'user-minus', 'user-cog', 'users-round', 'contact', 'id-card', 'baby', 'person-standing',
      'accessibility', 'smile', 'frown', 'meh', 'laugh', 'angry', 'hand', 'hand-heart', 'heart-handshake', 'graduation-cap', 'briefcase', 'crown', 'medal', 'award', 'trophy',
    ],
  },
  {
    label: 'Lieux',
    icons: [
      'globe', 'earth', 'map', 'map-pin', 'map-pinned', 'navigation', 'compass', 'home', 'house', 'building', 'building-2', 'factory', 'hotel', 'hospital', 'school',
      'university', 'landmark', 'church', 'castle', 'tent', 'mountain', 'trees', 'palmtree', 'waves', 'plane', 'train-front', 'car', 'bus', 'bike', 'ship-wheel',
      'fuel', 'parking-meter', 'traffic-cone', 'route',
    ],
  },
  {
    label: 'Temps',
    icons: ['calendar', 'calendar-days', 'calendar-check', 'calendar-x', 'calendar-clock', 'calendar-range', 'clock-3', 'history', 'sunrise', 'sunset', 'sun', 'moon', 'cloud', 'cloud-rain', 'cloud-sun', 'umbrella', 'thermometer'],
  },
  {
    label: 'Données',
    icons: [
      'chart-bar', 'chart-column', 'chart-line', 'chart-pie', 'chart-area', 'chart-scatter', 'chart-spline', 'gauge', 'activity', 'trending-up', 'trending-down',
      'trending-up-down', 'arrow-up', 'arrow-down', 'arrow-up-right', 'arrow-down-right', 'database', 'table', 'table-2', 'sheet', 'sigma', 'calculator', 'hash',
      'binary', 'filter', 'funnel', 'layers', 'target', 'crosshair', 'radar', 'scan-search', 'search', 'list', 'list-checks', 'kanban', 'workflow', 'git-branch', 'network',
    ],
  },
  {
    label: 'Communication',
    icons: ['mail', 'mail-open', 'send', 'inbox', 'message-square', 'message-circle', 'messages-square', 'phone', 'phone-call', 'video', 'megaphone', 'rss', 'share-2', 'link', 'at-sign', 'newspaper', 'mic', 'headphones', 'headset'],
  },
  {
    label: 'Technique',
    icons: [
      'monitor', 'laptop', 'smartphone', 'tablet', 'tv', 'server', 'hard-drive', 'cpu', 'wifi', 'bluetooth', 'cloud-upload', 'cloud-download', 'code', 'terminal',
      'bug', 'wrench', 'hammer', 'settings', 'cog', 'plug', 'power', 'battery', 'battery-charging', 'key', 'key-round', 'shield', 'fingerprint', 'scan-face', 'bot', 'brain',
    ],
  },
  {
    label: 'Documents',
    icons: ['file', 'file-text', 'file-check', 'file-x', 'file-plus', 'file-spreadsheet', 'files', 'folder', 'folder-open', 'folder-kanban', 'book', 'book-open', 'notebook', 'notebook-pen', 'pen', 'pencil', 'clipboard', 'clipboard-check', 'paperclip', 'printer', 'image', 'camera', 'film', 'music'],
  },
  {
    label: 'Nature et vie',
    icons: ['leaf', 'sprout', 'flower', 'tree-pine', 'apple', 'carrot', 'coffee', 'wine', 'utensils', 'pizza', 'cake', 'dog', 'cat', 'fish', 'bird', 'paw-print', 'heart-pulse', 'stethoscope', 'pill', 'syringe', 'dumbbell', 'gamepad-2', 'palette', 'paintbrush', 'shirt', 'gem', 'rocket', 'lightbulb', 'puzzle'],
  },
]

export const EMOJI_GROUPS: readonly { readonly label: string; readonly emojis: readonly string[] }[] = [
  { label: 'Statuts', emojis: ['✅', '❌', '⚠️', '⛔', '⏳', '⌛', '🔄', '⏸️', '▶️', '⏹️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '⭐', '🌟', '🔥', '💡', '📌', '🚩', '🏁', '❓', '❗', '💯'] },
  { label: 'Commerce', emojis: ['🛒', '🛍️', '💳', '💰', '💶', '💵', '🪙', '🧾', '🏷️', '📦', '🎁', '🚚', '🚛', '🏪', '🏬', '🏦', '📈', '📉', '💹', '🤝', '↩️', '🔁'] },
  { label: 'Personnes', emojis: ['👤', '👥', '🧑‍💼', '👩‍💻', '👨‍🔧', '🧑‍🏫', '🧑‍⚕️', '👶', '🙂', '😀', '😍', '😐', '😕', '😞', '😡', '👍', '👎', '👋', '🙏', '💪'] },
  { label: 'Lieux et transports', emojis: ['🏠', '🏢', '🏭', '🏥', '🏫', '🏛️', '🌍', '🌎', '🌏', '🗺️', '📍', '✈️', '🚆', '🚗', '🚌', '🚲', '⛴️', '🏖️', '⛰️', '🏙️', '🇫🇷', '🇪🇺', '🇬🇧', '🇩🇪', '🇪🇸', '🇮🇹', '🇺🇸'] },
  { label: 'Nature', emojis: ['☀️', '🌤️', '🌧️', '❄️', '🌈', '🌱', '🍃', '🌳', '🌸', '🍎', '🍇', '🥕', '🍷', '☕', '🍕', '🐶', '🐱', '🐟', '🐝', '🦋'] },
  { label: 'Objets', emojis: ['💻', '📱', '🖥️', '⚙️', '🔧', '🔒', '🔑', '📊', '🗂️', '📁', '📄', '📝', '✉️', '📞', '📣', '🔔', '📅', '⏰', '🎯', '🚀', '💎', '🏆', '🎉', '🎓', '🩺', '💊', '🧪', '🔬'] },
]
