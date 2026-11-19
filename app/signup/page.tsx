import SignupForm from "./SignupForm";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic"; // the Turnstile site key is read from the environment at request time

export default function SignupPage() {
  return <SignupForm turnstileSiteKey={turnstileSiteKey()} />;
}
