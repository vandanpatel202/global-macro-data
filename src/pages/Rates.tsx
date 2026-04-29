import SectionPage from '../components/SectionPage';
import YieldCurve from '../components/YieldCurve';

export default function Rates() {
  return (
    <SectionPage
      sectionKey="rates"
      perfBarTitle="Yields — daily Δ bps (scaled % of yield)"
      extra={items => <YieldCurve items={items} />}
    />
  );
}
