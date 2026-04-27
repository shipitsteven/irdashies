import type { CoachingOverlayConfig } from '@irdashies/types';
import { useCoaching } from './hooks/useCoaching';
import { useSectionFeedback } from './hooks/useSectionFeedback';
import { ActionItems } from './components/ActionItems';
import { RadioMessage } from './components/RadioMessage';
import { StatusIndicator } from './components/StatusIndicator';
import { SectionToast } from './components/SectionToast';
import './CoachingOverlay.css';

type CoachingOverlayProps = Partial<CoachingOverlayConfig>;

export const CoachingOverlay = ({
  showRadioMessage = true,
  radioFadeDuration = 10,
  showActionItems = true,
  maxActionItems = 5,
  showStatusIndicator = true,
  fontSize = 14,
  opacity = 0.9,
}: CoachingOverlayProps) => {
  const { latestCoaching, serviceConnected, isProcessing } = useCoaching();
  const { visibleFeedback } = useSectionFeedback();

  return (
    <div
      className="w-full rounded-sm p-2"
      style={{ backgroundColor: `rgba(15, 23, 42, ${opacity})` }}
    >
      {/* Header: Status indicator */}
      {showStatusIndicator && (
        <div className="flex justify-end mb-1">
          <StatusIndicator
            connected={serviceConnected}
            processing={isProcessing}
          />
        </div>
      )}

      {/* Action items — persistent until next lap */}
      {showActionItems && latestCoaching && (
        <ActionItems
          lines={latestCoaching.coaching_lines}
          maxItems={maxActionItems}
          fontSize={fontSize}
        />
      )}

      {/* Radio message — fades after duration */}
      {showRadioMessage && (
        <div className="mt-2">
          <RadioMessage
            message={latestCoaching?.radio_message ?? null}
            fadeDuration={radioFadeDuration}
            fontSize={fontSize}
          />
        </div>
      )}

      {/* Section toast — brief feedback on section exit */}
      <SectionToast feedback={visibleFeedback} fontSize={fontSize} />

      {/* Empty state */}
      {!latestCoaching && !visibleFeedback && (
        <div
          className="text-slate-500 italic"
          style={{ fontSize: `${fontSize - 2}px` }}
        >
          {serviceConnected
            ? 'Waiting for coaching data...'
            : 'Coaching service not connected'}
        </div>
      )}
    </div>
  );
};
