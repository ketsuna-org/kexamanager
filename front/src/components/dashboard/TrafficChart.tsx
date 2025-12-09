import { Box, Card, Typography, useTheme } from "@mui/material"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"


type TrafficDataPoint = { time: string, value: number };

interface TrafficChartProps {
    data: TrafficDataPoint[];
}

const TrafficChart = ({ data }: TrafficChartProps) => {
    const theme = useTheme()

    return (
        <Card sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 4 }}>System Traffic (24h)</Typography>
            <Box sx={{ width: "100%", height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="time"
                            stroke={theme.palette.text.secondary}
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke={theme.palette.text.secondary}
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickCount={5}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: theme.palette.background.paper,
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: 8
                            }}
                            itemStyle={{ color: theme.palette.text.primary }}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={theme.palette.primary.main}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorValue)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </Box>
        </Card>
    )
}

export default TrafficChart
