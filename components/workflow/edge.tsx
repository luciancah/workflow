import {
  BaseEdge,
  type EdgeProps,
  EdgeText,
  getBezierPath,
  getSimpleBezierPath,
} from '@xyflow/react';

const Temporary = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) => {
  const [path] = getSimpleBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      className="wf-edge-path"
      style={{
        stroke: selected ? 'var(--muted-foreground)' : 'var(--border)',
        strokeDasharray: '5 5',
      }}
    />
  );
};

const Animated = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  label,
}: EdgeProps) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="wf-edge-path wf-edge-path--animated"
        style={{
          stroke: selected ? 'var(--muted-foreground)' : 'var(--border)',
        }}
      />
      {label ? (
        <EdgeText
          x={labelX}
          y={labelY - 8}
          label={label}
          labelStyle={{ fill: 'var(--foreground)', fontSize: 11 }}
          labelBgStyle={{ fill: 'var(--popover)', fillOpacity: 0.86 }}
          labelBgPadding={[4, 6]}
          labelBgBorderRadius={4}
        />
      ) : null}
    </>
  );
};

export const WorkflowEdge = {
  Animated,
  Temporary,
};
