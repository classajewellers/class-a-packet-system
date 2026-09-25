import { assigneeInitials } from "@/lib/workshopAssignee";

export default function AssigneeMark({
  name,
  color = "#635BFF",
  size = 22,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      title={name}
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: size <= 20 ? 9 : 10,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {assigneeInitials(name)}
    </span>
  );
}
