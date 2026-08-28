import React from 'react'

interface Props { status?: string; className?: string }

export const VoiceStatusDisplay: React.FC<Props> = ({ status, className }) => (
  <div className={className}>VoiceStatus: {status}</div>
)
