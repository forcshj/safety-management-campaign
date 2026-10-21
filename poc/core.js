export function validateConfig(c){
 if(!c||c.version!==1||typeof c.companyId!=='string'||!Array.isArray(c.scenarios)||!c.scenarios.length)throw Error('version, companyId, scenarios를 포함하는 설정 파일이 필요합니다.');
 const ids=new Set();
 for(const s of c.scenarios){if(!s||typeof s.id!=='string'||ids.has(s.id)||typeof s.label!=='string'||typeof s.templateId!=='string'||!Array.isArray(s.fields))throw Error('시나리오 설정이 올바르지 않습니다.');ids.add(s.id);const fields=new Set();for(const f of s.fields){if(typeof f.id!=='string'||!f.id.trim()||fields.has(f.id)||typeof f.value!=='string')throw Error('필드 ID 중복 또는 잘못된 입력값이 있습니다.');fields.add(f.id);}}
 return c;
}
export function publicConfig(c){return {version:1,companyId:c.companyId,countryCode:c.countryCode||'kr',memberId:'',scenarios:c.scenarios.map(s=>({id:s.id,label:s.label,templateId:s.templateId,fields:s.fields.map(f=>({id:f.id,value:'',enabled:f.enabled!==false}))}))};}
export function buildOption(c,s,{memberId='',title='',recipients=[]}={}){
 if(!/^[a-f\d]{32}$/i.test(c.companyId.trim())||!/^[a-f\d]{32}$/i.test(s.templateId.trim()))throw Error('회사 ID와 템플릿 ID는 32자리 영문·숫자 ID를 확인하세요.');
 const ids=new Set();for(const f of s.fields){if(!f.id.trim()||ids.has(f.id))throw Error('필드 ID가 비어 있거나 중복됩니다.');ids.add(f.id);}
 if(!Array.isArray(recipients)||recipients.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('수신자 설정은 객체의 JSON 배열이어야 합니다.');
 const fields=s.fields.filter(f=>f.enabled!==false).map(f=>({id:f.id,value:f.value}));
 const option={company:{id:c.companyId.trim(),country_code:c.countryCode||'kr'},mode:{type:'01',template_id:s.templateId.trim()},user:{type:'01',...(memberId.trim()?{id:memberId.trim()}:{})},prefill:{fields,...(title.trim()?{document_name:title.trim()}:{}),...(recipients.length?{recipients}:{})},return_fields:fields.map(f=>f.id)};
 return option;
}
export function returnedFields(res){return Array.isArray(res?.fields)?res.fields:[];}
