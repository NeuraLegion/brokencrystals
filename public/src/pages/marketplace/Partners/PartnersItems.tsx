import React, { FC } from 'react';
import { Partner } from '../../../interfaces/Partner';

interface Props {
  partners: Array<Partner>;
}

export const PartnersItems: FC<Props> = (props: Props) => {
  const { partners } = props;
  return (
    <>
      {partners.map((item, index) => (
        <div className="partner-item" key={item.name + index}>
          <h4 className="partner-name">{item.name}</h4>
          <img src={item.photoUrl} className="partner-img" alt="" />
        </div>
      ))}
    </>
  );
};

export default PartnersItems;
