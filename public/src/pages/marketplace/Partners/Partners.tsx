import React, { FC, useEffect, useState } from 'react';
import { queryPartners } from '../../../api/httpClient';
import { Partner } from '../../../interfaces/Partner';
import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';
import PartnersItems from './PartnersItems';
// import TestimonialsForm from './TestimonialsForm';
// import TestimonialsItems from './TestimonialsItems';

interface Props {
  preview: boolean;
}

export const Partners: FC<Props> = (props: Props) => {
  const [names, setNames] = useState<Array<string>>([]);
  const [ages, setAges] = useState<Array<number>>([]);
  const [profession, setProfession] = useState<Array<string>>([]);
  const [residency, setResidency] = useState<Array<string>>([]);
  
  const [partners, setPartners] = useState<Array<Partner>>();

  useEffect(() => {
    queryPartners("name").then((data) => setNames(data));
    queryPartners("age").then((data) => setAges(data));
    queryPartners("profession").then((data) => setProfession(data));
    queryPartners("residency", "country").then((data) => setResidency(data));
    
    let tmpParnterList = Array<Partner>();
    for(let name in names) {
      tmpParnterList += {name : "asd"}
    }

    setPartners
  }, []);

  return (
    <section id="partners" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Our Partners</h2>
        </div>

        {partnersNames ? (
          <OwlCarousel className="owl-carousel" dots items={3} loop={true}>
            <PartnersItems partnersNames={partnersNames} />
          </OwlCarousel>
        ) : null}
      </div>
    </section>
  );
};

export default Partners;
