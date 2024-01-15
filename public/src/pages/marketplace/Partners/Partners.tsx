import React, { FC, useEffect, useState } from 'react';
import { searchPartners, partnerLogin } from '../../../api/httpClient';
import { Partner } from '../../../interfaces/Partner';
import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';
// import PartnersItems from './PartnersItems';
import PartnerLoginForm from './PartnerLoginForm';

interface Props {
  preview: boolean;
}

export const Partners: FC<Props> = (props: Props) => {
  const [partnersNames, setPartnersNames] = useState<XMLDocument>();

  useEffect(() => {
    searchPartners("").then((data) => setPartnersNames(data));
  }, []);

  return (
    <section id="partners" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Our Partners</h2>
        </div>

        {partnersNames && partnersNames.childNodes.forEach(name => {
          <h3>{name}</h3>
        })}
      </div>

      <div>
        {props.preview || (
          <PartnerLoginForm />
        )}
      </div>
    </section>
  );
};

export default Partners;
