import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { 
  List, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  IconButton,
  Box,
  styled 
} from "@mui/material";
import { Lightbulb, Cpu, LocateFixed, Dice4, BrainCog, Stethoscope, File } from "lucide-react";
import { ChevronRight, ChevronLeft } from "@mui/icons-material";

const StyledSidebar = styled(Box)(({ theme, open }) => ({
  position: "fixed",
  top: "60px",
  left: 0,
  height: "calc(100vh - 60px)",
  width: open ? "240px" : "60px",
  backgroundColor: "#fff",
  borderRight: "1px solid #ddd",
  transition: "width 0.3s",
  zIndex: 999,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column"
}));

const ToggleButtonWrapper = styled(Box)({
  position: "relative",
  height: "48px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "0 18px",
});

const StyledToggleButton = styled(IconButton)(({ theme }) => ({
  padding: "4px",
  width: "24px",
  height: "24px",
  minWidth: "24px",
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  color: "#1a1a1a",
  "&:hover": {
    backgroundColor: "#f0f0f0"
  }
}));

const StyledList = styled(List)({
  padding: 0,
  flex: 1
});

const StyledNavLink = styled(NavLink)({
  textDecoration: "none",
  color: "#1a1a1a", // Dark text color
  display: "block",
  "& .MuiListItemButton-root": {
    "&:hover": {
      backgroundColor: "#eef2f6", // Light blue-gray on hover
    },
    "& .MuiListItemText-primary": {
      color: "#1a1a1a", // Dark text for all items
      fontSize: "13px",
      fontWeight: 500,
    },
    "& .MuiListItemIcon-root": {
      color: "#4a4a4a", // Darker gray for icons
    }
  },
  "&.active": {
    "& .MuiListItemButton-root": {
      backgroundColor: "rgba(25, 118, 210, 0.08)", // Light indigo background
      borderLeft: "3px solid #1a1a1a", // Indigo border
      "& .MuiListItemIcon-root": {
        color: "#1a1a1a", // Indigo for active icon
      },
      "& .MuiListItemText-primary": {
        color: "#1a1a1a", // Keep dark text for active item
        fontWeight: 600,
      }
    }
  }
});

const navItems = [
  { icon: <Lightbulb />, path: "/dashboard", label: "Insights", exact: true },
  { icon: <Cpu />, path: "/dashboard/eda-report", label: "EDA Report" },
  { icon: <LocateFixed />, path: "/dashboard/mmm-model-summary", label: "MMM model summary" },
  { icon: <Dice4 />, path: "/dashboard/mso-optimization-results", label: "MSO-Optimization results" },
  { icon: <BrainCog/>, path: "/dashboard/gen-ai-explanation", label: "Gen AI Explanation"},
];

const Sidebar = ({ onTabClick }) => {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleSidebar = () => setOpen(!open);

  const handleTabClick = (label, path) => {
    console.log('Tab clicked:', label);
    onTabClick(label);
    navigate(path);
  };

  return (
    <StyledSidebar open={open}>
      <ToggleButtonWrapper>
        <StyledToggleButton onClick={toggleSidebar} size="small">
          {open ? <ChevronLeft /> : <ChevronRight />}
        </StyledToggleButton>
      </ToggleButtonWrapper>

      <StyledList>
        {navItems.map((item) => (
          <StyledNavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            onClick={() => handleTabClick(item.label, item.path)}
          >
            <ListItemButton>
              <ListItemIcon
                sx={{
                  minWidth: open ? 40 : "100%",
                  justifyContent: open ? "flex-start" : "center",
                }}
              >
                {item.icon}
              </ListItemIcon>
              {open && <ListItemText primary={item.label} />}
            </ListItemButton>
          </StyledNavLink>
        ))}
      </StyledList>
    </StyledSidebar>
  );
};

export default Sidebar;