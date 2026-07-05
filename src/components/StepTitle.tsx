// 카드 상단에 붙는 번호 달린 단계 제목 — 처음 보는 사람도 순서만 따라가면 되도록
export default function StepTitle({ n, title, desc }: { n: number; title: string; desc?: string }) {
  return (
    <div className="step-head">
      <span className="step-num" aria-hidden="true">
        {n}
      </span>
      <div className="step-body">
        <h2>{title}</h2>
        {desc && <span className="sub">{desc}</span>}
      </div>
    </div>
  )
}
