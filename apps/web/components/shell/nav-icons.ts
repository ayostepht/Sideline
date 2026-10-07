import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ClipboardList,
  House,
  Settings,
  Shield,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import type { NavKey } from "../../lib/client/nav";

export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  home: House,
  lineup: ClipboardList,
  matchup: Swords,
  waivers: UserPlus,
  players: Users,
  league: Trophy,
  trades: ArrowLeftRight,
  team: Shield,
  settings: Settings,
};
