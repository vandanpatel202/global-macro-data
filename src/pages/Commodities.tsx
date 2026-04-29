import SectionPage from '../components/SectionPage';
import ForwardCurve from '../components/ForwardCurve';

export default function Commodities() {
  return (
    <SectionPage
      sectionKey="commodities"
      perfBarTitle="Commodities — daily % change"
      extra={() => <ForwardCurve />}
    />
  );
}
