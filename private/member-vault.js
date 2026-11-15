(() => {
  "use strict";
  const root=document.querySelector("#vault-command-deck");
  if(!root)return;
  const tabs=[...root.querySelectorAll('[role="tab"][data-vault-deck-tab]')];
  const panels=new Map([...root.querySelectorAll('[role="tabpanel"][data-vault-deck-panel]')]
    .map(panel=>[panel.dataset.vaultDeckPanel,panel]));
  if(tabs.length!==4||panels.size!==4)return;
  function select(tab,{focus=false}={}){
    const key=tab.dataset.vaultDeckTab;
    if(!panels.has(key))return;
    for(const current of tabs){
      const active=current===tab;
      current.setAttribute("aria-selected",String(active));
      current.tabIndex=active?0:-1;
    }
    for(const [name,panel] of panels)panel.hidden=name!==key;
    root.dataset.activePanel=key;
    if(focus)tab.focus({preventScroll:true});
  }
  for(const [index,tab] of tabs){
    tab.addEventListener("click",()=>select(tab));
    tab.addEventListener("keydown",event=>{
      if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
      event.preventDefault();
      const rtl=document.documentElement.dir==="rtl";
      let target=index;
      if(event.key==="Home")target=0;
      else if(event.key==="End")target=tabs.length-1;
      else if(event.key==="ArrowRight")target=(index+(rtl?-1:1)+tabs.length)%tabs.length;
      else target=(index+(rtl?1:-1)+tabs.length)%tabs.length;
      select(tabs[target],{focus:true});
    });
  }
  select(tabs.find(tab=>tab.getAttribute("aria-selected")==="true")||tabs[0]);
})();