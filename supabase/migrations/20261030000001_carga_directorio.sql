
do $$ begin
  if to_regclass('public.employee_directory') is null then raise exception 'Ejecuta primero migracion_v7_usuarios_directorio.sql'; end if;
end $$;

insert into public.departments(name)
select d.n from (values ('EQUIPO SOPORTE CLIENTES')) as d(n)
where not exists(select 1 from public.departments x where lower(btrim(x.name)) = lower(btrim(d.n)));

insert into public.employee_directory
  (document_number, full_name, email, department_name, position_name, grade, hire_date, base_salary, schedule_label, union_code, food_allowance_ref, app_role)
values
  ('1095835619','RAFAEL SANTOS AGUILERA MEDINA','rafael.aguilera@essa.com.co','EQUIPO SOPORTE CLIENTES','Calificado','6','2024-03-05',2304482.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('63540083','LADY VIVIANA ALBARRACIN CAMPOS','lady.albarracin@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-07-13',4522362.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1102549668','GUSTAVO ANDRES ARENAS RODRIGUEZ','gustavo.arenas@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2021-11-03',4522362.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('37619875','LEIDY JOHANNA BADILLO RAMIREZ','leidy.badillo@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-11-06',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098763659','LAURA ANDREA BAEZ BAYONA','laura.baez@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 1','3','2015-03-05',6925450.00,'Jornada Normal Diurna ( 7-12 2-6 )','SIPROESSA',23235.00,'professional'),
  ('1098631683','ADRIANA BAUTISTA ALFONSO','adriana.bautista@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2012-06-04',5204900.00,'Jornada Normal Diurna (8-12:30 1:30 - 6)','SINTRAELECOL',27000.00,'employee'),
  ('28259561','NIDIA ESPERANZA BECERRA PINTO','nidia.becerra@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2007-07-19',5204900.00,'Jornada Normal Diurna (6:30 -11:30 12:30 - 4:30)','SINTRAELECOL',27000.00,'employee'),
  ('63475749','ESMERALDA BERMUDEZ RANGEL','esmeralda.bermudez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2016-05-04',4957480.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('13543368','WALTER ENRIQUE BUELVAS SARABIA','walter.buelvas@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2004-06-25',5204900.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('28105305','YANETH CABALLERO PLATA','yaneth.caballero@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2012-01-02',5204900.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('37860660','LIZETH JOHANNA CAICEDO MELO','lizeth.caicedo@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2019-06-25',4522362.00,'Jornada Normal Diurna (7:30-12 1-5:30)','SINTRAELECOL',27000.00,'employee'),
  ('1005464582','MARIANA CARVAJAL CALDERON','mariana.carvajal@essa.com.co','EQUIPO SOPORTE CLIENTES','Altamente Calificado','12','2025-08-22',3053670.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098801771','JESSICA LISSETH CEPEDA SUAREZ','jessica.cepeda@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-11-04',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1057578684','JAIRO CHAVES MALAVER','jairo.chaves@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-07-01',4522362.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098637960','JORGE LUIS DELGADO RANGEL','jorge.delgado@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-12-10',4522362.00,'Jornada Normal Diurna ( 7-12 2-6 )','SINTRAELECOL',27000.00,'employee'),
  ('1095819991','ANDERSON YESID DIAZ GALVIS','anderson.diaz@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 1','E','2025-11-04',6090099.00,'Jornada Normal Diurna (7-12 1-5)',null,23235.00,'employee'),
  ('1098610366','JESSICA GARCIA RAMIREZ','jessica.garcia@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2023-06-27',4137608.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('1098677298','LAURA ANDREA GARZON MONSALVE','laura.garzon@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2023-06-28',4137608.00,'Jornada Normal Diurna (7:30-12 1-5:30)','SINTRAELECOL',27000.00,'employee'),
  ('63347619','ADRIANA MARIA GOMEZ MANTILLA','adriana.gomez@essa.com.co','EQUIPO SOPORTE CLIENTES','Calificado','11','2006-08-01',3008696.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1005299754','HERNAN FABIAN GOYENECHE SOTO','hernan.goyeneche@essa.com.co','EQUIPO SOPORTE CLIENTES','Altamente Calificado','12','2024-09-16',3053670.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098614162','EDWARD FELIPE HERNANDEZ OROZCO','edward.hernandez.orozco@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2024-05-20',4137608.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('37618602','ALBA YANETH LEAL HERNANDEZ','alba.leal@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-08-26',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1101176657','YINETH NATALIA LOPEZ LEMUS','yineth.lopez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2018-10-18',4522362.00,'Jornada Normal Diurna (7:30-12 1-5:30)','SINTRAELECOL',27000.00,'employee'),
  ('1095796303','DIANA CAROLINA MARTINEZ AMOROCHO','diana.carolina.martinez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-07-23',4522362.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('1058844430','JAMES DAVID MARTINEZ GARCIA','james.martinez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2024-11-07',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('8782972','FRANCISCO JAVIER MONDUL MARTINEZ','francisco.mondul@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 3','E','2005-04-01',8281534.00,'Jornada Normal Diurna (8-12:30 1:30 - 6)','SIPROESSA',23235.00,'employee'),
  ('63510433','ZAIDA MILENA MONSALVE GIL','zaida.monsalve@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2003-08-06',5204900.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('91531225','EDWARD LEONARDO MONTAÑEZ CABALLERO','edward.montanez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2024-12-04',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098732245','SILVIA JULIANA NIÑO SALCEDO','silvia.juliana.nino@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-11-04',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098772070','MAYRA ALEJANDRA PARDO FLOREZ','mayra.pardo@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2023-04-12',4137608.00,'Jornada Normal Diurna (7:30-12 1-5:30)','SINTRAELECOL',27000.00,'employee'),
  ('37842804','LAURA PATRICIA REYES RINCON','laura.reyes@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 1','4','2004-06-17',7225836.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SIPROESSA',23235.00,'employee'),
  ('63557207','KELLY JOHANNA REYES VILLAMIZAR','kelly.reyes@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2021-04-15',4522362.00,'Jornada Normal Diurna (6:30 -11:30 12:30 - 4:30)','SINTRAELECOL',27000.00,'employee'),
  ('1098689299','DIANA CAROLINA RIOS JONES','diana.rios@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2021-02-04',4522362.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1096249782','JAIME ARLEY RIZO MORALES','jaime.rizo@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 1','E','2023-03-02',5288084.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'admin'),
  ('37754887','CLAUDIA MARINA ROA SANCHEZ','claudia.roa@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-12-10',4522362.00,'Jornada Normal Diurna ( 7-12 2-6 )','SINTRAELECOL',27000.00,'employee'),
  ('63536803','YUDY CAROLINA RODRIGUEZ GUTIERREZ','yudy.rodriguez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2005-10-20',5204900.00,'Jornada Tecnica Diurna ( 7-12 1-5 )','SINTRAELECOL',27000.00,'employee'),
  ('91270853','JOSE DEL CARMEN ROJAS BERNAL','jose.rojas@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 1','3','2003-06-03',5537635.00,'Jornada Normal Diurna (6:30 -11:30 12:30 - 4:30)','SINTRAELECOL',27000.00,'employee'),
  ('63537270','GLORIA LILIANA ROJAS MORENO','gloria.liliana.rojas@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','18','2004-03-09',5204900.00,'Jornada Normal Diurna ( 7-12 2-6 )','SINTRAELECOL',27000.00,'employee'),
  ('1016018678','TANIA MAGALY SANCHEZ BERNAL','tania.sanchez@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-11-04',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098665148','YURLEY VIVIANA SANDOVAL PEREZ','yurley.sandoval@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2024-10-15',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098687493','LEYLA MARIANA SERRANO SANDOVAL','leyla.serrano@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','16','2025-01-15',4137608.00,'Jornada Normal Diurna (7-12 1-5)','SINTRAELECOL',27000.00,'employee'),
  ('1098670898','NORA LILIANA VILLAMIZAR JAIMES','nora.villamizar@essa.com.co','EQUIPO SOPORTE CLIENTES','Tecnico','17','2020-12-10',4522362.00,'Jornada Normal Diurna ( 7-12 2-6 )','SINTRAELECOL',27000.00,'employee'),
  ('37751602','ZAYDA JOHANNA RODRIGUEZ SANCHEZ','zayda.rodriguez@essa.com.co','EQUIPO SOPORTE CLIENTES','Profesional 4','E','2017-11-10',11208618.00,'Jornada Normal Diurna (7:30-12 1-5:30)','SIPROESSA',27000.00,'manager')
on conflict (document_number) do update set
  full_name = excluded.full_name, email = excluded.email, department_name = excluded.department_name, position_name = excluded.position_name,
  grade = excluded.grade, hire_date = excluded.hire_date, base_salary = excluded.base_salary, schedule_label = excluded.schedule_label,
  union_code = excluded.union_code, food_allowance_ref = excluded.food_allowance_ref, app_role = excluded.app_role, loaded_at = now()
where public.employee_directory.profile_id is null;

-- Verificación rápida (debe coincidir con el Excel):
select count(*) as funcionarios, count(*) filter (where app_role = 'admin') as administradores, count(*) filter (where app_role = 'manager') as jefes,
       count(*) filter (where app_role = 'professional') as profesionales, count(*) filter (where app_role = 'employee') as funcionarios_rol
  from public.employee_directory;
