import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export const isIframe = window.self !== window.top;

export function formatCurrency(amount) {
  return amount
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    + '₫';
}

export function formatNumber(amount) {
  return amount
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatDate(date) {
  return date;
}
