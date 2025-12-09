import { Breadcrumbs, Link, Typography } from "@mui/material"
import { Home } from "lucide-react"

interface S3BreadcrumbsProps {
    bucket: string
    prefix: string
    onNavigate: (newPrefix: string) => void
    onBackToBuckets: () => void
}

export default function S3Breadcrumbs({ bucket, prefix, onNavigate, onBackToBuckets }: S3BreadcrumbsProps) {
    // Current path segments
    const parts = prefix.split('/').filter(p => p);

    return (
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
            <Link
                component="button"
                underline="hover"
                color="inherit"
                onClick={() => onBackToBuckets()}
                sx={{ display: 'flex', alignItems: 'center' }}
            >
                <Home size={16} style={{ marginRight: 4 }} />
                Buckets
            </Link>

            <Link
                component="button"
                underline="hover"
                color="inherit"
                onClick={() => onNavigate("")}
            >
                {bucket}
            </Link>

            {parts.map((part, index) => {
                const isLast = index === parts.length - 1;
                const path = parts.slice(0, index + 1).join('/') + '/';

                return isLast ? (
                    <Typography key={path} color="text.primary">
                        {part}
                    </Typography>
                ) : (
                    <Link
                        key={path}
                        component="button"
                        underline="hover"
                        color="inherit"
                        onClick={() => onNavigate(path)}
                    >
                        {part}
                    </Link>
                );
            })}
        </Breadcrumbs>
    )
}
