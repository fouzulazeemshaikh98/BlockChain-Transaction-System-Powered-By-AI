import { Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import SendTransfer from "./pages/SendTransfer";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Report from "./pages/Report";
import Templates from "./pages/Templates";
import Admin from "./pages/Admin";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import DevToolsGuard from "./components/DevToolsGuard";
import { UserRole } from "./lib/api";

function Protected({ children, restrictTo }: { children: React.ReactNode; restrictTo?: UserRole[] }) {
  return (
    <ProtectedRoute restrictTo={restrictTo}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

const STAFF_ONLY: UserRole[] = ["Admin", "Analyst"];

export default function App() {
  return (
    <>
      <DevToolsGuard />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        <Route path="/" element={<Protected restrictTo={STAFF_ONLY}><Dashboard /></Protected>} />
        <Route path="/send-transfer" element={<Protected><SendTransfer /></Protected>} />
        <Route path="/transactions" element={<Protected restrictTo={STAFF_ONLY}><Transactions /></Protected>} />
        <Route path="/reports" element={<Protected restrictTo={STAFF_ONLY}><Reports /></Protected>} />
        <Route path="/reports/:transactionId" element={<Protected restrictTo={STAFF_ONLY}><Report /></Protected>} />
        <Route path="/templates" element={<Protected restrictTo={STAFF_ONLY}><Templates /></Protected>} />
        <Route path="/admin" element={<Protected restrictTo={["Admin"]}><Admin /></Protected>} />
      </Routes>
    </>
  );
}
