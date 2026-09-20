import { MyProgress } from '@/components/voortgang';

/**
 * An instructeur's own voortgang. Instructeurs are kandidaat too — the
 * instructeursopleidingen have their own eigenvaardigheidsniveau — so they need
 * the same lijst a lid has, next to the one they aftekenen in.
 */
export default function Mij() {
  return <MyProgress />;
}
