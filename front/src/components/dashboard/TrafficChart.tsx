import { Box, Card, Typography, useTheme } from "@mui/material"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

const data = [
    { time: "23h", value: 350 }, { time: "0h", value: 350 }, { time: "1h", value: 180 },
    { time: "2h", value: 380 }, { time: "3h", value: 300 }, { time: "4h", value: 500 },
    { time: "5h", value: 600 }, { time: "6h", value: 350 }, { time: "7h", value: 360 },
    { time: "8h", value: 320 }, { time: "9h", value: 400 }, { time: "10h", value: 300 },
    { time: "11h", value: 100 }, { time: "12h", value: 400 }, { time: "13h", value: 580 },
    { time: "14h", value: 480 }, { time: "15h", value: 460 }, { time: "16h", value: 560 },
    { time: "17h", value: 340 }, { time: "18h", value: 480 }, { time: "19h", value: 530 },
    { time: "20h", value: 250 }, { time: "21h", value: 420 }, { time: "22h", value: 200 },
]

const TrafficChart = () => {
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
