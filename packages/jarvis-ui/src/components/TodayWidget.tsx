import React from 'react'

interface Props { className?: string }

export const TodayWidget: React.FC<Props> = ({ className }) => (
  <div className={className}>TodayWidget</div>
)
