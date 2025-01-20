import React from "react";
import { Navigate, useLocation } from "react-router-dom";

function PrivateRoute({ element }) {
  const location = useLocation();
  
  const getUser = () => {
    try {
      const userData = localStorage.getItem("user");
      return userData ? JSON.parse(userData) : null;
    } catch {
      localStorage.clear();
      return null;
    }
  };

  const user = getUser();

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return element;
}

export default PrivateRoute;