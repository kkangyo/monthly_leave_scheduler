import ReactDOM from "react-dom/client";
import "./index.css";
import { AuthProvider } from "./hooks/useAuth";
import AuthGate from "./AuthGate";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
