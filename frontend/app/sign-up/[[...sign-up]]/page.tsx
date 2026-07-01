import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center w-full h-screen">
      <SignUp />
    </div>
  );
}
