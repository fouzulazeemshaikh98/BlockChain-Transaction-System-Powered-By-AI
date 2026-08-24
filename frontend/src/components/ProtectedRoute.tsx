import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../lib/api";

interface Props {
  children: React.ReactNode;
  /// If set, only these roles may view this route - anyone else logged
  /// in gets redirected to Send Transfer (the one page every role can
  /// reach) rather than shown an empty/erroring page. Omit for routes
  /// every authenticated role can see.
  restrictTo?: UserRole[];
}

export default function ProtectedRoute({ children, restrictTo }: Props) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (restrictTo && !restrictTo.includes(user.role)) {
    return <Navigate to="/send-transfer" replace />;
  }
  return <>{children}</>;
}
