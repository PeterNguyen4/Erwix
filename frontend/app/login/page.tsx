import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-gray-950">
      <SignIn routing="hash" />
    </div>
  );
}
