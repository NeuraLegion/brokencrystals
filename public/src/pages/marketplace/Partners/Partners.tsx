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

import { DOMParser } from 'xmldom';

export const Partners: FC<Props> = (props: Props) => {
  const [partnersNames, setPartnersNames] = useState<Array<string>>([]);

  useEffect(() => {
    searchPartners('').then((data) => {
      const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');

      // console.log('partners search xml: ');
      // console.log(xmlDoc);
      // console.log(typeof xmlDoc);

      const nameListTags = xmlDoc.getElementsByTagName('name');

      const namesList: Array<string> = [];
      for (let i = 0; i < nameListTags.length; i++) {
        namesList.push(nameListTags[i].textContent || '');
      }

      setPartnersNames(namesList);
    });
  }, []);

  return (
    <section id="partners" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Our Partners</h2>
        </div>

        {partnersNames.forEach((name) => {
          <h4>"AAA" {name}</h4>;
        })}
      </div>

      <div>{props.preview || <PartnerLoginForm />}</div>
    </section>
  );
};

export default Partners;
