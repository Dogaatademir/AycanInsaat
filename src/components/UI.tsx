import React, { type ReactNode } from "react";

export function PageTitle({children}:{children:ReactNode}) {
  return <h2 style={{margin:"0 0 12px 0"}}>{children}</h2>;
}
export function Card({children,style}:{children:ReactNode,style?:React.CSSProperties}){
  return <div className="card" style={style}>{children}</div>;
}
export function Stat({label,value}:{label:string,value:string}){
  return (
    <div className="card">
      <div className="helper">{label}</div>
      <div style={{fontSize:22,fontWeight:800}}>{value}</div>
    </div>
  );
}
export function Row({children,className}:{children:ReactNode,className?:string}){
  return <div className={`row ${className||""}`}>{children}</div>;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>){
  return <input {...props} className={`input ${props.className||""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>){
  return <select {...props} className={`select ${props.className||""}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>){
  return <textarea {...props} className={`textarea ${props.className||""}`} />;
}
export function Button({
  variant="default", className, ...props
}:{variant?: "default"|"primary"|"secondary"|"ghost"|"danger"} & React.ButtonHTMLAttributes<HTMLButtonElement>){
  const v = variant!=="default" ? variant : "";
  return <button {...props} className={`btn ${v} ${className||""}`} />;
}

/* Basit, esnek logo — renkleri temadan alır */
export function Logo({size=28}:{size?:number}){
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Aycan İnşaat Logo">
      {/* A formunda minimal bina/çerçeve */}
      <path d="M4 28 L16 4 L28 28" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M12 28 L20 28" fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function Table({head,children}:{head:ReactNode,children:ReactNode}){
  return (
    <table className="table">
      <thead><tr>{head}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}
