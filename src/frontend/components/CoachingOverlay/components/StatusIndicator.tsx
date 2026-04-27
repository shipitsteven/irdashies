interface StatusIndicatorProps {
  connected: boolean;
  processing: boolean;
}

export const StatusIndicator = ({
  connected,
  processing,
}: StatusIndicatorProps) => {
  let color: string;
  let title: string;

  if (!connected) {
    color = 'bg-red-500';
    title = 'Disconnected';
  } else if (processing) {
    color = 'bg-amber-400 animate-pulse';
    title = 'Processing...';
  } else {
    color = 'bg-green-400';
    title = 'Connected';
  }

  return (
    <div className="flex items-center gap-1.5" title={title}>
      <div className={`w-2 h-2 rounded-full ${color}`} />
    </div>
  );
};
