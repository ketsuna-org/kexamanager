import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import Divider from "@mui/material/Divider"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import { Server } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useProject } from "../../contexts/ProjectContext"

/** Sentinel value of the "manage projects" entry inside the select. */
const MANAGE_PROJECTS_VALUE = "__manage-projects__"

const typeColor = (type: string) => (type === "s3" ? "info" : "secondary")

/**
 * Compact project switcher for the top bar: shows the active project (name +
 * type), switches it without leaving the current screen, and links to the
 * project management screen. Renders an empty state when the user has no
 * project yet.
 */
const ProjectSwitcher = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { projects, selectedProjectId, selectedProject, selectProject, loading } = useProject()

    if (projects.length === 0) {
        return (
            <Chip
                icon={<Server size={14} />}
                label={loading ? t("projects.switcher_loading") : t("projects.switcher_none")}
                size="small"
                variant="outlined"
                clickable
                onClick={() => navigate("/projects")}
            />
        )
    }

    const handleChange = (value: string) => {
        if (value === MANAGE_PROJECTS_VALUE) {
            navigate("/projects")
            return
        }
        const parsed = Number.parseInt(value, 10)
        selectProject(Number.isNaN(parsed) ? null : parsed)
    }

    return (
        <Select<string>
            size="small"
            variant="outlined"
            displayEmpty
            disabled={loading}
            value={selectedProjectId === null ? "" : String(selectedProjectId)}
            onChange={(event) => handleChange(String(event.target.value))}
            slotProps={{ input: { "aria-label": t("projects.switcher_label") } }}
            renderValue={() => (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {selectedProject?.name ?? (loading ? t("projects.switcher_loading") : t("projects.switcher_none_selected"))}
                    </Typography>
                    {selectedProject?.type && (
                        <Chip size="small" label={selectedProject.type.toUpperCase()} color={typeColor(selectedProject.type)} />
                    )}
                </Stack>
            )}
            sx={{ height: 36, minWidth: { xs: 140, sm: 220 }, maxWidth: { xs: 200, sm: 320 } }}
        >
            {projects.map((project) => (
                <MenuItem key={project.id} value={String(project.id)}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" }}>
                        <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                            {project.name}
                        </Typography>
                        {project.type && (
                            <Chip size="small" label={project.type.toUpperCase()} color={typeColor(project.type)} />
                        )}
                    </Box>
                </MenuItem>
            ))}
            <Divider />
            <MenuItem value={MANAGE_PROJECTS_VALUE}>{t("projects.switcher_manage")}</MenuItem>
        </Select>
    )
}

export default ProjectSwitcher
