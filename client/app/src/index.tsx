import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { AgentProvider } from "./hooks/useAgentinfo";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <AgentProvider>
    <App />
  </AgentProvider>
);
