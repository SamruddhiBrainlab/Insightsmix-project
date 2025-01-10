import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { 
  List, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  IconButton,
  Box,
  styled 
} from "@mui/material";
import { Lightbulb, Cpu, LocateFixed, Dice4, BrainCog,Stethoscope, File } from "lucide-react";
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
  height: "48px", // Fixed height for toggle button area
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "0 18px",
  // borderBottom: "1px solid #ddd"
});

const StyledToggleButton = styled(IconButton)(({ theme }) => ({
  padding: "4px",
  width: "24px",
  height: "24px",
  minWidth: "24px",
  backgroundColor: "#fff",
  border: "1px solid #ddd",
  "&:hover": {
    backgroundColor: "#f5f5f5"
  }
}));

const StyledList = styled(List)({
  padding: 0,
  flex: 1
});

const navItems = [
  { icon: <Lightbulb />, path: "/", label: "Insights" },
  { icon: <Cpu />, path: "/market-mix-modelling", label: "Market Mix Modelling" },
  { icon: <LocateFixed />, path: "/market-mix-modelling-result", label: "Market Mix Modelling Result" },
  { icon: <Dice4 />, path: "/mso-optimization-results", label: "MSO-Optimization results" },
  { icon: <BrainCog/>, path: "gen-ai-explanation", label: "Gen AI Explanation"},
  { icon: <Stethoscope />, path: "/model-health", label: "Model Health" },
  { icon: <File />, path: "/userguide", label: "User Guide" },
];

const Sidebar = () => {
  const [open, setOpen] = useState(true);

  const toggleSidebar = () => {
    setOpen(!open);
  };

  return (
    <StyledSidebar open={open}>
      <ToggleButtonWrapper>
        <StyledToggleButton
          onClick={toggleSidebar}
          size="small"
        >
          {open ? <ChevronLeft /> : <ChevronRight />}
        </StyledToggleButton>
      </ToggleButtonWrapper>

      <StyledList>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <ListItemButton>
              <ListItemIcon sx={{ 
                minWidth: open ? 40 : "100%",
                justifyContent: open ? 'flex-start' : 'center'
              }}>
                {item.icon}
              </ListItemIcon>
              {open && <ListItemText primary={item.label} primaryTypographyProps={{fontSize: "12px"}}/>}
            </ListItemButton>
          </NavLink>
        ))}
      </StyledList>
    </StyledSidebar>
  );
};

export default Sidebar;