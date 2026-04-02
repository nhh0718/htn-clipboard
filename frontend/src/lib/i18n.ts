// Minimal i18n — Vietnamese / English.
// Usage: const t = useTranslation()  →  t('search_placeholder')

import { createContext, useContext } from 'react'

export type Lang = 'vi' | 'en'

const translations = {
  en: {
    search_placeholder: 'Search clipboard history…',
    settings: 'Settings',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    no_history: 'No clipboard history yet',
    loading: 'Loading…',
    copied: 'Copied!',
    // Settings fields
    http_port: 'HTTP Port',
    auth_token: 'Auth Token',
    hotkey: 'Hotkey',
    data_dir: 'Data Directory',
    retention_days: 'Retention (days)',
    max_items: 'Max Items',
    language: 'Language',
    theme: 'Theme',
    theme_dark: 'Dark',
    theme_light: 'Light',
    // Appearance
    appearance: 'Appearance',
    general: 'General',
    // Errors
    load_failed: 'Failed to load settings.',
    save_failed: 'Failed to save settings.',
    // Token
    show_token: 'Show token',
    hide_token: 'Hide token',
    copy_token: 'Copy token',
    // Autostart / Health
    auto_start: 'Start on Boot',
    auto_start_desc: 'Launch Clipboard Pro when Windows starts',
    health_title: 'Health Check',
    health_status: 'Status',
    health_uptime: 'Uptime',
    health_items: 'Items in DB',
    health_api: 'API Port',
    health_monitor: 'Monitor',
    health_autostart: 'Auto Start',
    health_active: 'Active',
    health_inactive: 'Inactive',
    health_enabled: 'Enabled',
    health_disabled: 'Disabled',
    // Filters
    filter: 'Filter',
    filter_all: 'All',
    filter_text: 'Text',
    filter_image: 'Image',
    filter_anytime: 'Anytime',
    // time
    just_now: 'just now',
  },
  vi: {
    search_placeholder: 'Tìm kiếm clipboard…',
    settings: 'Cài đặt',
    cancel: 'Huỷ',
    save: 'Lưu',
    saving: 'Đang lưu…',
    no_history: 'Chưa có lịch sử clipboard',
    loading: 'Đang tải…',
    copied: 'Đã chép!',
    // Settings fields
    http_port: 'HTTP Port',
    auth_token: 'Mã xác thực',
    hotkey: 'Phím tắt',
    data_dir: 'Thư mục dữ liệu',
    retention_days: 'Lưu trữ (ngày)',
    max_items: 'Số mục tối đa',
    language: 'Ngôn ngữ',
    theme: 'Giao diện',
    theme_dark: 'Tối',
    theme_light: 'Sáng',
    // Appearance
    appearance: 'Giao diện',
    general: 'Chung',
    // Errors
    load_failed: 'Không tải được cài đặt.',
    save_failed: 'Không lưu được cài đặt.',
    // Token
    show_token: 'Hiện mã',
    hide_token: 'Ẩn mã',
    copy_token: 'Chép mã',
    // Autostart / Health
    auto_start: 'Khởi động cùng máy',
    auto_start_desc: 'Tự chạy Clipboard Pro khi bật Windows',
    health_title: 'Kiểm tra hệ thống',
    health_status: 'Trạng thái',
    health_uptime: 'Thời gian chạy',
    health_items: 'Mục trong DB',
    health_api: 'Cổng API',
    health_monitor: 'Giám sát',
    health_autostart: 'Tự khởi động',
    health_active: 'Hoạt động',
    health_inactive: 'Không hoạt động',
    health_enabled: 'Bật',
    health_disabled: 'Tắt',
    // Filters
    filter: 'Lọc',
    filter_all: 'Tất cả',
    filter_text: 'Văn bản',
    filter_image: 'Hình ảnh',
    filter_anytime: 'Mọi lúc',
    // time
    just_now: 'vừa xong',
  },
} as const

export type TKey = keyof typeof translations.en

export const LangContext = createContext<Lang>('en')
export const LangSetterContext = createContext<{ setLang: (l: Lang) => void }>({ setLang: () => {} })

export function useTranslation() {
  const lang = useContext(LangContext)
  return (key: TKey): string => translations[lang][key]
}
