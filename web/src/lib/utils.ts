import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const itemPrices: Record<string, number> = {
  sheets: 15,
  duvet_covers: 24,
  pillowcases: 3,
  large_towels: 11,
  small_towels: 7,
  kitchen_towels: 1,
  beach_mat: 7,
  rugs: 7,
};
