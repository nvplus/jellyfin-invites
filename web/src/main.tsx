import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Admin from "./pages/Admin";
import Register from "./pages/Register";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Admin />} />
        <Route path="/register/:token" element={<Register />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
